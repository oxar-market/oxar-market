import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { OxarEscrow } from "../target/types/oxar_escrow";

describe("oxar-escrow", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.oxarEscrow as Program<OxarEscrow>;

  it("Is initialized!", async () => {
    // Add your test here.
    const tx = await program.methods.initialize().rpc();
    console.log("Your transaction signature", tx);
  });
});
