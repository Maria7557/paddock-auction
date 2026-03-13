module.exports.jwtVerify = async function jwtVerifyProxy(...args) {
  const jose = await import("jose");

  return jose.jwtVerify(...args);
};
