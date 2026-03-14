module.exports.loadJose = async function loadJose() {
  return import("jose");
};

module.exports.jwtVerify = async function jwtVerifyProxy(...args) {
  const jose = await module.exports.loadJose();

  return jose.jwtVerify(...args);
};
