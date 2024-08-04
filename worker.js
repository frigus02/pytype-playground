importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.js");

async function preparePytype() {
  self.postMessage({ notify: "Loading Pyodide..." });
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
  self.postMessage({ notify: "Preparing pytype..." });
  const versions = await pyodide.runPythonAsync(`
    import sys
    from pytype import __version__
    (sys.version, __version__.__version__)
  `);
  self.postMessage({ versions: { python: versions[0], pytype: versions[1] } });
  const pytype = await pyodide.runPythonAsync(`
    from pytype import analyze
    from pytype import config
    from pytype import load_pytd

    options = config.Options.create()
    loader = load_pytd.create_loader(options)

    class Pytype:
      def check(self, code):
        try :
          res = analyze.check_types(code, options, loader)
          return str(res.context.errorlog)
        except Exception as e:
          return str(e)

    Pytype()
  `);
  self.postMessage({ notify: "Ready" });
  return pytype;
}
const pytypePromise = preparePytype();

self.onmessage = async (event) => {
  const { src } = event.data;
  try {
    const pytype = await pytypePromise;
    const result = await pytype.check(src).replace(/\x1b\[[0-9;]*m?/g, "");
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
