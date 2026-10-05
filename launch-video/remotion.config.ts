import { Config } from '@remotion/cli/config';

// Quality: lossless PNG frames (JPEG intermediates blocked up dark gradients and small text),
// BT.709 colour so players don't shift the palette, and a low CRF with a slower x264 preset.
Config.setVideoImageFormat('png');
Config.setColorSpace('bt709');
Config.setCrf(12);
Config.setX264Preset('slow');
Config.setAudioBitrate('320k');
Config.setOverwriteOutput(true);

// Optional: point at a local Chrome Headless Shell (e.g. in sandboxes without
// internet access to download one) via REMOTION_BROWSER_EXECUTABLE.
if (process.env.REMOTION_BROWSER_EXECUTABLE) {
  Config.setBrowserExecutable(process.env.REMOTION_BROWSER_EXECUTABLE);
}
