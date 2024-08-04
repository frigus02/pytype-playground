import * as monaco from "monaco-editor/esm/vs/editor/editor.main.js";

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

function setupSaveCodeToUrl() {
  const listeners = {};

  monaco.editor.onDidCreateModel((model) => onModelAdd(model));
  monaco.editor.onWillDisposeModel(onModelRemoved);

  monaco.editor.getModels().forEach((model) => onModelAdd(model));

  async function saveCodeToUrl() {
    const model = monaco.editor.getModels()[0];
    const src = model?.getValue() ?? "";
    await compressToUrl(src);
  }

  function onModelAdd(model) {
    let handle;
    const changeSubscription = model.onDidChangeContent(() => {
      clearTimeout(handle);
      handle = window.setTimeout(saveCodeToUrl, 500);
    });

    listeners[model.uri.toString()] = {
      dispose() {
        changeSubscription.dispose();
        clearTimeout(handle);
      },
    };

    saveCodeToUrl();
  }

  function onModelRemoved(model) {
    const key = model.uri.toString();
    listeners[key]?.dispose();
    delete listeners[key];
  }
}

function setupDiagnostics(getWorker) {
  const listeners = {};

  monaco.editor.onDidCreateModel((model) => onModelAdd(model));
  monaco.editor.onWillDisposeModel(onModelRemoved);
  monaco.editor.onDidChangeModelLanguage((event) => {
    onModelRemoved(event.model);
    onModelAdd(event.model);
  });

  monaco.editor.getModels().forEach((model) => onModelAdd(model));

  async function validate(model) {
    const worker = await getWorker(model.uri);
    if (model.isDisposed()) {
      // model was disposed in the meantime
      return;
    }

    const diagnostics = await worker.getDiagnostics(model.uri.toString());
    if (!diagnostics || model.isDisposed()) {
      // model was disposed in the meantime
      return;
    }

    monaco.editor.setModelMarkers(model, "python", diagnostics);
  }

  function onModelAdd(model) {
    if (model.getLanguageId() !== "python") {
      return;
    }

    let handle;
    const changeSubscription = model.onDidChangeContent(() => {
      clearTimeout(handle);
      handle = window.setTimeout(validate, 500, model);
    });

    listeners[model.uri.toString()] = {
      dispose() {
        changeSubscription.dispose();
        clearTimeout(handle);
      },
    };

    validate(model);
  }

  function onModelRemoved(model) {
    monaco.editor.setModelMarkers(model, "python", []);
    const key = model.uri.toString();
    listeners[key]?.dispose();
    delete listeners[key];
  }
}

function createWorkerFactory() {
  let client;
  let worker;
  return async (...resources) => {
    if (!client || !worker) {
      worker = monaco.editor.createWebWorker({
        label: "python",
        keepIdleModels: true,
      });
      client = worker.getProxy();
    }

    await worker?.withSyncedResources(resources);
    return client;
  };
}

monaco.languages.onLanguage("python", () => {
  const getWorker = createWorkerFactory();
  setupSaveCodeToUrl();
  setupDiagnostics(getWorker);
  getWorker()
    .then((worker) => worker.getVersions())
    .then((versions) => {
      pythonVersion.innerText = versions.python;
      pytypeVersion.innerText = versions.pytype;
    });
});

self.MonacoEnvironment = {
  getWorkerUrl: function (_moduleId, label) {
    if (label === "python") {
      return "./worker.js";
    }
    return "./vs/editor/editor.worker.js";
  },
};

const initialCode =
  (await decompressFromUrl()) ?? 'def foo(x):\n  return x + 2\n\nfoo("1")';
const editor = monaco.editor.create(document.getElementById("editor"), {
  value: initialCode,
  language: "python",
});
window.addEventListener("resize", () => {
  editor.layout();
});
