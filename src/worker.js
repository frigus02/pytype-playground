import * as worker from "monaco-editor/esm/vs/editor/editor.worker.js";

importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.js");

async function preparePytype() {
  const pyodide = await loadPyodide({
    packages: [
      "./wheels/attrs-24.1.0-py3-none-any.whl",
      "./wheels/immutabledict-4.2.0-py3-none-any.whl",
      "./wheels/pycnite-2024.7.31-py3-none-any.whl",
      "./wheels/pytype-2024.4.11-cp311-cp311-emscripten_3_1_46_wasm32.whl",
      "./wheels/tabulate-0.9.0-py3-none-any.whl",
      "./wheels/typing_extensions-4.12.2-py3-none-any.whl",
      "msgspec",
    ],
  });
  const versions = await pyodide.runPythonAsync(`
    import sys
    from pytype import __version__
    (sys.version, __version__.__version__)
  `);
  const pytype = await pyodide.runPythonAsync(`
    from pytype import analyze
    from pytype import config
    from pytype import load_pytd

    options = config.Options.create()
    loader = load_pytd.create_loader(options)

    class Pytype:
      def check(self, code):
        try:
          res = analyze.check_types(code, options, loader)
          return [
            {
              "severity": e._severity,
              "line": e._line,
              "col": e._col,
              "endline": e._endline,
              "endcol": e._endcol,
              "message": e._message,
              "details": e._details,
              "name": e._name
            }
            for e in res.context.errorlog
          ]
        except Exception as e:
          return {
            "severity": 2, # 2 = Error
            "line": 1,
            "col": 0,
            "endline": 1,
            "endcol": 0,
            "message": str(e)
          }

    Pytype()
  `);
  return {
    pytype,
    pythonVersion: versions[1],
    pytypeVersion: versions[1],
  };
}

class PythonWorker {
  constructor(ctx) {
    this.ctx = ctx;
    this.pytypePromise = preparePytype();
  }

  getModel(fileName) {
    const models = this.ctx.getMirrorModels();
    return models.find((m) => m.uri.toString() === fileName);
  }

  async getVersions() {
    const { pythonVersion, pytypeVersion } = await this.pytypePromise;
    return { python: pythonVersion, pytype: pytypeVersion };
  }

  async getDiagnostics(fileName) {
    const { pytype } = await this.pytypePromise;
    const model = this.getModel(fileName);
    if (!model) return [];
    const errors = await pytype
      .check(model.getValue())
      .toJs({ create_proxies: false });
    return errors.map((e) => {
      let message = e.get("message");
      const details = e.get("details");
      if (details) {
        message += "\n  " + details.replaceAll("\n", "\n  ");
      }
      return {
        severity: e.get("severity") === 2 ? 8 : 4, // 8 = Error, 4 = Warning
        startLineNumber: e.get("line"),
        startColumn: e.get("col") + 1,
        endLineNumber: e.get("endline"),
        endColumn: e.get("endcol") + 1,
        message,
        code: e.get("name"),
      };
    });
  }
}

self.onmessage = () => {
  worker.initialize((ctx, createData) => {
    return new PythonWorker(ctx, createData);
  });
};
