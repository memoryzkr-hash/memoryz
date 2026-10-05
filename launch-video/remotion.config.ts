import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);

// Optional: point at a local Chrome Headless Shell (e.g. in sandboxes without
// internet access to download one) via REMOTION_BROWSER_EXECUTABLE.
if (process.env.REMOTION_BROWSER_EXECUTABLE) {
  Config.setBrowserExecutable(process.env.REMOTION_BROWSER_EXECUTABLE);
}
