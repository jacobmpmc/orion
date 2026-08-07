// Deliberately invalid on several counts at once, to prove problems are
// collected rather than reported one restart at a time.
export default {
  port: "8080",
  connections: [
    { name: "prod/eu", package: "./a.mjs" },
    { package: "./b.mjs" },
    { name: "prod", package: "./c.mjs" },
  ],
  tls: { cert: "cert.pem" },
};
