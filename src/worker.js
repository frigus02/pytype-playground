import * as worker from "monaco-editor/esm/vs/editor/editor.worker.js";

importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.js");

async function preparePytype() {
  const pyodide = await loadPyodide({
    packages: [
      "./wheels/attrs-24.2.0-py3-none-any.whl",
      "./wheels/immutabledict-4.2.0-py3-none-any.whl",
      "./wheels/pycnite-2024.7.31-py3-none-any.whl",
      "./wheels/pytype-2024.9.13-cp312-cp312-pyodide_2024_0_wasm32.whl",
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
  const flags = await pyodide.runPythonAsync(`
    from pytype import config
    def _flag(f):
      return {
        "name": f.dest,
        "flag": f.long_opt,
        "default": f.get("default"),
        "description": f.get("help")
      }
    (
      [_flag(f) for f in config.FEATURE_FLAGS],
      [_flag(f) for f in config.EXPERIMENTAL_FLAGS]
    )
  `);
  const pytype = await pyodide.runPythonAsync(`
    from pytype import analyze
    from pytype import config
    from pytype import load_pytd

    options = config.Options.create()
    loader = load_pytd.create_loader(options)

    class Pytype:
      def check(self, code, flags={}):
        try:
          options = config.Options.create(**flags.to_py())
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
              "methodname": e._methodname,
              "name": e._name
            }
            for e in res.context.errorlog
          ]
        except Exception as e:
          return [{
            "severity": 2, # 2 = Error
            "line": 1,
            "col": 0,
            "endline": 1,
            "endcol": 0,
            "message": str(e)
          }]

    Pytype()
  `);
  return {
    pytype,
    flags: {
      feature: flagsToMap(flags[0]),
      experimental: flagsToMap(flags[1]),
    },
    pythonVersion: versions[0],
    pytypeVersion: versions[1],
  };
}

function flagsToMap(flags) {
  return flags.map((f) => ({
    name: f.get("name"),
    flag: f.get("flag"),
    default: f.get("default"),
    description: f.get("description"),
  }));
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

  async getFlags() {
    const { flags } = await this.pytypePromise;
    return flags;
  }

  async getDiagnostics(fileName, options) {
    const { pytype } = await this.pytypePromise;
    const model = this.getModel(fileName);
    if (!model) return [];
    const errors = await pytype
      .check(model.getValue(), options)
      .toJs({ create_proxies: false });
    return errors.map((e) => ({
      severity: e.get("severity"),
      line: e.get("line"),
      col: e.get("col"),
      endline: e.get("endline"),
      endcol: e.get("endcol"),
      message: e.get("message"),
      details: e.get("details"),
      methodname: e.get("methodname"),
      name: e.get("name"),
    }));
  }
}

self.onmessage = () => {
  worker.initialize((ctx, createData) => {
    return new PythonWorker(ctx, createData);
  });
};
