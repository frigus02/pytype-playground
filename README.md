# Pytype Playground

Run [pytype](https://github.com/google/pytype) in the browser (in [Pyodide](https://pyodide.org)) as a quick and dirty playground.

## Development

### Python dependencies

- Pytype wheel created manually using [update_wheels.sh](./update_wheels.sh) and submitted.
- Pytype dependencies downloaded using `pip download` and submitted. Loading those wheels locally seemed faster than installing them using micropip.
  - Not all packages mentioned in pytype deps are required to run pytype itself. Some are only used by pytype tools (e.g. debugger). The ones in [wheels](./wheels) seems to be enough.
  - The `msgpack` dependency has native code, but is luckily built-in to Pyodide.

### Run locally

```
npm install
node ./build.js  # run again after change
python3 -m http.server --directory dist/
```
