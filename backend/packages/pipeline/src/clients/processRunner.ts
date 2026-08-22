import { spawn } from "node:child_process";

/** Runs a binary (yt-dlp, ffmpeg, ffprobe) to completion, throwing with stderr on non-zero exit. */
export function runCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to start "${command}": ${err.message}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        // ffmpeg/yt-dlp often warn on stderr without failing (missing fonts,
        // skipped formats, etc.) — surface it instead of silently dropping it.
        if (stderr.trim()) {
          console.warn(`[${command}] warnings:\n${stderr.trim().slice(-2000)}`);
        }
        resolve(stdout);
      } else {
        reject(new Error(`"${command} ${args.join(" ")}" exited with code ${code}\n${stderr.slice(-2000)}`));
      }
    });
  });
}
