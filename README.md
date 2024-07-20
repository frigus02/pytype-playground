# Pytype Playground

Run [pytype](https://github.com/google/pytype) in the browser (in [Pyodide](https://pyodide.org)) as a quick and dirty playground.

## Development

- Pytype wheel created manually using [make_pytype_wheel.sh](./make_pytype_wheel.sh) and submitted.
- Pytype dependencies downloaded using `pip download` and submitted. Loading those wheels locally seemed faster than installing them using micropip.
  - Not all packages mentioned in pytype deps are required to run pytype itself. Some are only used by pytype tools (e.g. debugger). The ones in [wheels](./wheels) seems to be enough.
  - The `msgpack` dependency has native code, but is luckily built-in to Pyodide.
- Run locally using `python3 -m http.server`.
