module.exports = {
  testEnvironment: "jsdom",
  testMatch: ["<rootDir>/src/**/*.test.ts"],
  transform: { "^.+\\.[tj]s$": "@swc/jest" },
  transformIgnorePatterns: [
    "/node_modules/(?!(query-string|decode-uri-component|split-on-first|filter-obj)/)",
  ],
};