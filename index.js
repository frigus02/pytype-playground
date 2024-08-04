const pytypeWorker = new Worker("./worker.js");

async function compressToUrl(src) {
  const stream = new Blob([src])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"));
  const bytes = await new Response(stream).bytes();
  const code = btoa(String.fromCharCode(...bytes));
  const params = new URLSearchParams();
  params.append("code", code);
  location.hash = params;
}

async function decompressFromUrl() {
  const params = new URLSearchParams(location.hash.substring(1));
  const code = params.get("code");
  if (!code) {
    return undefined;
  }

  try {
    const bytesStr = atob(code);
    const bytes = new Uint8Array(bytesStr.length);
    for (let i = 0; i < bytesStr.length; i++) {
      bytes[i] = bytesStr.charCodeAt(i);
    }

    const stream = new Blob([bytes])
      .stream()
      .pipeThrough(new DecompressionStream("deflate-raw"));
    return await new Response(stream).text();
  } catch (e) {
    return undefined;
  }
}

let currentTask = undefined;
let queuedTask = undefined;
function runPytype(src) {
  const { promise, resolve, reject } = Promise.withResolvers();
  if (!currentTask) {
    pytypeWorker.postMessage({ src });
    currentTask = { resolve, reject };
    setupFinally(promise);
  } else {
    queuedTask?.reject(new Error("cancelled"));
    queuedTask = { promise, resolve, reject, src };
  }
  return promise;
}
function setupFinally(promise) {
  promise.finally(() => {
    if (queuedTask) {
      const { promise, resolve, reject, src } = queuedTask;
      pytypeWorker.postMessage({ src });
      currentTask = { resolve, reject };
      setupFinally(promise);
      queuedTask = undefined;
    } else {
      currentTask = undefined;
    }
  });
}
pytypeWorker.onmessage = ({ data }) => {
  if ("notify" in data) {
    updateOutput(data.notify);
  } else if ("versions" in data) {
    pythonVersion.innerText = data.versions.python;
    pytypeVersion.innerText = data.versions.pytype;
  } else if ("result" in data) {
    currentTask?.resolve(data.result);
  } else if ("error" in data) {
    currentTask?.reject(new Error(data.error));
  } else {
    updateOutput(`Unexpected message from pytype worker. See browser console.`);
    console.log(data);
  }
};

function updateOutput(text) {
  const now = new Date().toLocaleString();
  output.innerText = `[${now}] ${text}`;
}

async function onChange() {
  try {
    const src = input.value;
    const result = await runPytype(src);
    await compressToUrl(src);
    if (result) {
      updateOutput(`Type checking found issues:\n${result}`);
    } else {
      updateOutput("Type checking found no issues.");
    }
  } catch (e) {
    updateOutput(`Type checking failed: ${e.message}`);
  }
}

const initialCode =
  (await decompressFromUrl()) ?? 'def foo(x):\n  return x + 2\n\nfoo("1")';
input.value = initialCode;
input.oninput = onChange;
onChange();
