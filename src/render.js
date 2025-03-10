import { join } from "https://deno.land/std@0.106.0/path/mod.ts";
import React from "react";
import ReactDOM from "react-dom/server";
import { join } from "https://deno.land/std@0.106.0/path/mod.ts";
import { Router } from "wouter";
import { HelmetProvider } from "helmet";

const isDev = Deno.env.get("mode") === "dev";
const serverStart = +new Date();

const render = async ({ root, request, importmap, lang }) => {
  const ts = isDev ? +new Date() : serverStart;
  const app = await import(join(root, `app.js?ts=${ts}`));

  const helmetContext = { helmet: {} };
  const cache = new Map();

  const body = ReactDOM.renderToReadableStream(
    React.createElement(
      Router,
      { hook: staticLocationHook(request.url.pathname) },
      React.createElement(
        HelmetProvider,
        { context: helmetContext },
        React.createElement(
          app.default,
          { cache },
          null,
        ),
      ),
    ),
  );
  const { helmet } = helmetContext;

  const head = `<!DOCTYPE html><html lang="${lang}"><head>${
    Object.keys(helmet)
      .map((i) => helmet[i].toString())
      .join("")
  }<script type="module" defer>import { createElement } from "${
    importmap.imports["react"]
  }";import { hydrateRoot } from "${
    importmap.imports["react-dom"]
  }";import { Router } from "${
    importmap.imports["wouter"]
  }";import { HelmetProvider } from "${
    importmap.imports["helmet"]
  }";import App from "/app.js";const root = hydrateRoot(document.getElementById('ultra'),createElement(Router, null, createElement(HelmetProvider, null, createElement(App))))</script></head><body><div id="ultra">`;

  return new ReadableStream({
    start(controller) {
      function pushStream(stream) {
        const reader = stream.getReader();
        return reader.read().then(function process(result) {
          if (result.done) return;
          try {
            controller.enqueue(result.value);
            return reader.read().then(process);
          } catch (_e) {
            return;
          }
        });
      }
      const queue = (part) => Promise.resolve(controller.enqueue(part));

      queue(head)
        .then(() => pushStream(body))
        .then(() =>
          queue(
            `</div></body><script>self.__ultra = ${
              JSON.stringify(Array.from(cache.entries()))
            }</script></html>`,
          )
        )
        .then(() => controller.close());
    },
  });
};

export default render;

// wouter helper
const staticLocationHook = (path = "/", { record = false } = {}) => {
  // deno-lint-ignore prefer-const
  let hook;
  const navigate = (to, { replace } = {}) => {
    if (record) {
      if (replace) {
        hook.history.pop();
      }
      hook.history.push(to);
    }
  };
  hook = () => [path, navigate];
  hook.history = [path];
  return hook;
};
