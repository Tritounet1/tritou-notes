import dotenv from "dotenv";
dotenv.config();

import app from "./app";
import config from "./config/config";
import { assertConfig } from "./config/validateConfig";

// Fail at startup with a clear message rather than with 500s on the first requests.
assertConfig("api", { jwt: true, encryption: true });

app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
});
