require('dotenv').config();

module.exports = function () {
  return {
    flywayArgs: {
      url: `jdbc:postgresql://${process.env.DB_HOST}:5432/${process.env.DB_NAME}`,
      locations: 'filesystem:sql',
      user: process.env.DB_USER,
      password: process.env.DB_PW,
      table: 'schema_version',
    },
    downloads: {
      expirationTimeInMs: -1,
    }
  };
};
