import dotenv from "dotenv";
dotenv.config();

import app from "./app";
import config from "./config/config";
import { assertConfig } from "./config/validateConfig";
import { migrateLegacySchedulerJobs } from "./services/schedulerService";

// Fail at startup with a clear message rather than with 500s on the first requests.
assertConfig("api", { jwt: true, encryption: true });

migrateLegacySchedulerJobs()
  .then((moved) => moved > 0 && console.log(`Moved ${moved} scheduler job(s) to BullMQ job schedulers.`))
  .catch((error) => console.error("Could not migrate the scheduler jobs:", error));

app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
});
