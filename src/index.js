import * as monaco from "monaco-editor/esm/vs/editor/editor.main.js";

function getUrlParams() {
  return new URLSearchParams(location.hash.substring(1));
}

async function compressToUrl(src) {
  const stream = new Blob([src])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"));
  const bytes = await new Response(stream).bytes();
  const code = btoa(String.fromCharCode(...bytes));
  const params = getUrlParams();
  params.set("code", code);
  location.hash = params;
}

async function decompressFromUrl() {
  const params = getUrlParams();
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

async function setupInfo(getWorker) {
  const worker = await getWorker();
  const versions = await worker.getVersions();
  pythonVersion.innerText = versions.python;
  pytypeVersion.innerText = versions.pytype;
  loadingIndicator.remove();
  document.querySelector(".info").classList.remove("hidden");
}

async function setupFlags(getWorker) {
  const worker = await getWorker();
  const flags = await worker.getFlags();
  const params = getUrlParams();
  for (const f of flags.feature) {
    featureFlags.appendChild(createOption(f));
  }
  for (const f of flags.experimental) {
    experimentalFlags.appendChild(createOption(f));
  }

  function createOption(f) {
    const e = optionTemplate.content.cloneNode(true);
    const descriptionId = `description_${f.name}`;
    const input = e.querySelector("input");
    const name = e.querySelector(".name");
    const description = e.querySelector(".description");

    input.name = f.name;
    input.defaultChecked = f.default;
    if (params.get(f.name)) {
      input.checked = true;
    }
    input.setAttribute("aria-describedby", descriptionId);
    name.innerText = f.flag;
    description.id = descriptionId;
    description.innerText = f.description;
    return e;
  }
}

function getSelectedOptions() {
  return Object.fromEntries(
    [...new FormData(document.forms.options).entries()].map(([name, value]) => [
      name,
      !!value,
    ])
  );
}

function setupSaveStateToUrl() {
  const listeners = {};

  monaco.editor.onDidCreateModel((model) => onModelAdd(model));
  monaco.editor.onWillDisposeModel(onModelRemoved);

  monaco.editor.getModels().forEach((model) => onModelAdd(model));

  document.forms.options.addEventListener("change", saveOptionsToUrl);

  function saveOptionsToUrl() {
    const params = new URLSearchParams();
    const currentParams = getUrlParams();
    if (currentParams.has("code")) {
      params.set("code", currentParams.get("code"));
    }
    const options = getSelectedOptions();
    for (const [name, value] of Object.entries(options)) {
      params.set(name, value);
    }
    location.hash = params;
  }

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

function formatDiagnostics(diagnostics) {
  return diagnostics
    .map((d) => {
      const pos = `code.py:${d.line}:${d.col + 1}`;
      const severity = d.severity === 2 ? "error" : "warning";
      const method = d.methodname ? ` in ${d.methodname}:` : "";
      let res = `${pos}: ${severity}:${method} ${d.message} [${d.name}]`;
      if (d.details) {
        res += "\n  " + d.details.replaceAll("\n", "\n  ");
      }
      return res;
    })
    .join("\n\n");
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

    const diagnostics = await worker.getDiagnostics(
      model.uri.toString(),
      getSelectedOptions()
    );
    if (!diagnostics || model.isDisposed()) {
      // model was disposed in the meantime
      return;
    }

    const markers = diagnostics.map((d) => {
      let message = d.message;
      if (d.details) {
        message += "\n  " + d.details.replaceAll("\n", "\n  ");
      }
      return {
        severity:
          d.severity === 2
            ? monaco.MarkerSeverity.Error
            : monaco.MarkerSeverity.Warning,
        startLineNumber: d.line,
        startColumn: d.col + 1,
        endLineNumber: d.endline,
        endColumn: d.endcol + 1,
        message,
        code: d.name,
      };
    });

    monaco.editor.setModelMarkers(model, "python", markers);
    errors.innerText = formatDiagnostics(diagnostics);
  }

  function onModelAdd(model) {
    if (model.getLanguageId() !== "python") {
      return;
    }

    let handle;
    function debouncedChange() {
      clearTimeout(handle);
      handle = window.setTimeout(validate, 500, model);
    }

    const changeSubscription = model.onDidChangeContent(debouncedChange);
    const controller = new AbortController();
    document.forms.options.addEventListener("change", debouncedChange, {
      signal: controller.signal,
    });

    listeners[model.uri.toString()] = {
      dispose() {
        changeSubscription.dispose();
        controller.abort();
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
  setupSaveStateToUrl();
  setupInfo(getWorker);
  setupFlags(getWorker).then(() => {
    setupDiagnostics(getWorker);
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
monaco.editor.create(document.getElementById("editor"), {
  automaticLayout: true,
  minimap: { enabled: false },
  language: "python",
  value: initialCode,
});
