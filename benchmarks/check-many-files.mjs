import { checkBtXml } from "@btxml/core";

const start = performance.now();
for (let i = 0; i < 100; i++) {
  checkBtXml(`<root BTCPP_format="4"><BehaviorTree ID="bt_${i}"><Sequence/></BehaviorTree></root>`);
}
const elapsedMs = performance.now() - start;

console.log(`elapsedMs: ${elapsedMs}`);
if (elapsedMs > 10000) {
  process.exit(1);
}
