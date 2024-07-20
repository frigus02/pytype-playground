#!/bin/bash
set -xeuo pipefail

TMP="$(mktemp -d)"
pushd "${TMP}"

python3.11 -m venv venv
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
git checkout 4636e21ba00fdde9e8b1d92d03a29acfe3dc2031
git submodule update --init
pyodide build
popd

popd

echo "Wheel is available in"
echo "  ${TMP}/pytype/dist"
