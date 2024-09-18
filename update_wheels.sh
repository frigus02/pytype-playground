#!/bin/bash
set -xeuo pipefail


TMP="$(mktemp -d)"
pushd "${TMP}"

pyenv local 3.12
pyenv exec python -m venv venv
source venv/bin/activate
pip install pyodide-build

git clone https://github.com/emscripten-core/emsdk.git
pushd emsdk
git checkout 772828321afe0761c836bbbad3992ba392b9b708
PYODIDE_EMSCRIPTEN_VERSION="$(pyodide config get emscripten_version)"
./emsdk install "${PYODIDE_EMSCRIPTEN_VERSION}"
./emsdk activate "${PYODIDE_EMSCRIPTEN_VERSION}"
source emsdk_env.sh
popd

git clone https://github.com/google/pytype.git
pushd pytype
git checkout 2024.09.13
git submodule update --init
pyodide build
popd

deactivate
popd

rm wheels/*

cp "${TMP}/pytype/dist/pytype-"* ./wheels/
rm -rf "${TMP}"

# Based on https://github.com/google/pytype/blob/2024.09.13/requirements.txt
# - msgpack has native code but it luckily builtin to Pyodide
# - the remaining deps don't necessary for pytype itself
pyenv local 3.12
pyenv exec pip download -d wheels/ attrs immutabledict pycnite tabulate typing-extensions
