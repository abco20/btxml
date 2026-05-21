import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";

export async function promptSelect(params: {
  message: string;
  choices: Array<{ label: string; value: string; description?: string }>;
}): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    const lines = [`? ${params.message}`];
    for (let i = 0; i < params.choices.length; i++) {
      lines.push(`  ${i + 1}. ${params.choices[i].label}`);
      if (params.choices[i].description) {
        lines.push(`     ${params.choices[i].description}`);
      }
    }
    lines.push(`Select an action [1-${params.choices.length}]:`);

    while (true) {
      const answer = await rl.question(`${lines.join("\n")} `);
      const num = Number(answer.trim());
      if (!Number.isNaN(num) && num >= 1 && num <= params.choices.length) {
        return params.choices[num - 1].value;
      }
      output.write(`Please enter a number between 1 and ${params.choices.length}.\n`);
    }
  } finally {
    rl.close();
  }
}
