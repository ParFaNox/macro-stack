import { AgentConsole } from "@/components/agent-console";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";

/**
 * The agent, on its own page.
 *
 * The console itself lives in a component because the landing page leads with
 * it too — the agent is the product, so it should be the first thing a visitor
 * meets, not something they have to navigate to. Keeping one implementation
 * means the two surfaces cannot drift apart.
 */

export default function AgentPage() {
  return (
    <div className="min-h-screen bg-[#08080a] text-[#f0f0f5] font-sans antialiased flex flex-col">
      <Navbar />
      <main className="flex-1 w-full max-w-6xl mx-auto px-6 py-10">
        <AgentConsole />
      </main>
      <Footer />
    </div>
  );
}
