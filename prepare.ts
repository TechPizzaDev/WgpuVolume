import { $, file } from "bun";
import { resolve } from "path";
import { parseArgs } from "util";

const outPath = "./assets/img/volume/generated.bin.gz";

const { values, positionals } = parseArgs({
  args: Bun.argv,
  options: {
    regen: {
      type: 'boolean',
    },
  },
  strict: true,
  allowPositionals: true,
});

async function build() {
  if (!values.regen && await file(outPath).exists()) {
    console.log(`Noise file exists \n  at "${resolve(outPath)}"`);
    return;
  }

  let submodName = "./submodules/SharpFastNoise2/SharpFastNoise2.sln";
  if (!await file(submodName).exists()) {
    console.warn(`Submodule file "${submodName}" missing, skipping build.`);
    return;
  }

  $.cwd("./generator");

  console.log("Building noise generator...");
  await $`dotnet build -c Release`;

  console.log("Running noise generator...")
  let path = await $`dotnet run --no-build -c Release`.text();

  console.log(`Copying Noise file \n  from "${resolve(path)}" \n  to "${resolve(outPath)}"`);
  await Bun.write(file(outPath), file(path));
}

try {
  build();
} catch (e) {
  if (e instanceof $.ShellError) {
    const decoder = new TextDecoder();
    console.error("ShellError exitCode:", e.exitCode);
    console.error("ShellError stdout:", decoder.decode(e.stdout));
    console.error("ShellError stderr:", decoder.decode(e.stderr));
  } else {
    console.error(e);
  }
}