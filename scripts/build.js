const esbuild = require("esbuild");
const path = require("path");
const basePath = path.join(__dirname, "..");
const svgrPlugin = require("esbuild-plugin-svgr");
const autoprefixer = require("autoprefixer");
const postcss = require("postcss");
const postcssPresetEnv = require("postcss-preset-env");

module.exports = {
  basePath,
  buildInjector,
  buildBabelPlugin,
};

async function buildUi(config, configCSS) {
  const styles = await esbuild.build({
    entryPoints: [path.join(basePath, "src/ui/index.css")],
    bundle: true,
    loader: {
      ".png": "dataurl",
      ".svg": "dataurl",
    },
    sourcemap: false,
    ...configCSS,
    write: false,
  });

  // console.log(styles.to);

  const { css } = await postcss([
    autoprefixer,
    postcssPresetEnv({ stage: 0 }),
  ]).process(styles.outputFiles[0].text, { from: undefined });

  const result = await esbuild.build({
    entryPoints: [path.join(basePath, "src/ui/index.tsx")],
    bundle: true,
    sourcemap: true,
    format: "esm",
    write: false,
    loader: {
      ".svg": "text",
    },
    ...config,
    plugins: [
      svgrPlugin(),
      {
        // FIXME: That's a temporary fix.
        // Subscriber doesn't use for socket.io-client, however esbuild doesn't cut off it
        // since it is CommonJS module. Migration from socket.io v2 to v4 should potentially
        // fix the issue since v4 uses ESM
        name: "cut-off-subscriber",
        setup({ onLoad }) {
          onLoad({ filter: /socket\.io-client/ }, () => ({
            contents: "export default {}",
          }));
        },
      },
      ...((config && config.plugins) || []),
    ],
    define: {
      ...(config && config.define),
      __CSS__: JSON.stringify(css),
      // "process.env.NODE_ENV": '"production"',
    },
  });

  if (result.outputFiles && result.outputFiles.length) {
    return result.outputFiles[0].text;
  }
}

async function buildInjector(config) {
  config = config || {};

  const isDev = process.env.NODE_ENV === "development";

  const __UI_SRC__ = await buildUi(
    {
      minify: !isDev,
      sourcemap: isDev,
    },
    {
      minify: !isDev,
      sourcemap: isDev,
    }
  );

  await esbuild.build({
    entryPoints: [path.join(basePath, "src/injector/index.ts")],
    bundle: true,
    sourcemap: true,
    external: ["effector"],
    format: "esm",
    target: "es2015",
    platform: "browser",
    write: true,
    outfile: path.join(basePath, "dist/effector-injector.mjs"),
    ...config,
    define: {
      __DEV__: false,
      __UI_SRC__: JSON.stringify(__UI_SRC__),
      ...(config && config.define),
    },
  });
}

async function buildBabelPlugin(config) {
  config = config || {};

  config = {
    entryPoints: [path.join(basePath, "src/babel-plugin/index.ts")],
    bundle: false,
    sourcemap: true,

    platform: "neutral",
    write: true,
    ...config,
    define: {
      __DEV__: true,
      ...(config && config.define),
    },
  };

  await Promise.all(
    [
      {
        ...config,
        format: "esm",
        outfile: path.join(basePath, "dist/effector-babel-plugin.mjs"),
      },
      {
        ...config,
        format: "cjs",
        outfile: path.join(basePath, "dist/effector-babel-plugin.js"),
      },
    ].map(c => esbuild.build(c))
  );
}

if (require.main === module) {
  (async () => {
    process.env.NODE_ENV = "production";

    await buildInjector({ logLevel: "info" });
    await buildBabelPlugin({ logLevel: "info" });
  })();
}
