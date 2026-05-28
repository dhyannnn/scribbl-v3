import expoConfig from "eslint-config-expo/flat.js";

export default [
  {
    ignores: [".expo/**"],
  },
  {
    files: ["app.config.js", "babel.config.js"],
    languageOptions: {
      globals: {
        __dirname: "readonly",
        module: "readonly",
        require: "readonly",
      },
    },
  },
  ...expoConfig,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
];
