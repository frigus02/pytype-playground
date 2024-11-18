#!/bin/bash
set -euo pipefail

update_pytype() {
	pytype_version="${2:-"HEAD"}"

	set -x

	TMP="$(mktemp -d)"
	pushd "${TMP}"

	pyenv local 3.12
	pyenv exec python -m venv venv
	source venv/bin/activate
	pip install pyodide-build

	PYODIDE_EMSCRIPTEN_VERSION="$(pyodide config get emscripten_version)"
	git clone https://github.com/emscripten-core/emsdk.git
	pushd emsdk
	git checkout 772828321afe0761c836bbbad3992ba392b9b708
	./emsdk install "${PYODIDE_EMSCRIPTEN_VERSION}"
	./emsdk activate "${PYODIDE_EMSCRIPTEN_VERSION}"
	source emsdk_env.sh
	popd

	git clone https://github.com/google/pytype.git
	pushd pytype
	git checkout "${pytype_version}"
	git submodule update --init
	pyodide build
	popd

	deactivate
	popd

	wheel=$(find "${TMP}/pytype/dist/" -name 'pytype-*.whl' -printf '%f\n')
	dest_filename="$wheel"
	if [[ "$pytype_version" == "HEAD" ]]; then
		dest_filename="${wheel:0:-4}+nightly-$(date +%F).whl"
	fi

	cp "${TMP}/pytype/dist/${wheel}" "./wheels/${dest_filename}"
	#rm -rf "${TMP}"
}

update_deps() {
	# Based on https://github.com/google/pytype/blob/2024.10.11/requirements.txt
	# - msgpack has native code but it luckily builtin to Pyodide
	# - the remaining deps aren't necessary for running pytype in the configuration we do here
	pyenv local 3.12
	pyenv exec pip download -d wheels/ 'attrs==24.2.0' 'immutabledict==4.2.0' 'pycnite==2024.7.31' 'tabulate==0.9.0' 'typing-extensions==4.12.2'
}

usage() {
	echo "Usage: update_wheels.sh pytype [pytype_version]"
	echo "       update_wheels.sh deps"
}


if [[ $# -lt 1 ]]; then
	usage
	exit 1
fi

mode="$1"
if [[ "$mode" == "pytype" ]]; then
	update_pytype
elif [[ "$mode" == "deps" ]]; then
	update_deps
else
	usage
	exit 1
fi
