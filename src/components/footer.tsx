"use client";

export function Footer() {
  return (
    <footer className="w-full border-t border-[#181820] mt-20">
      <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs text-[#646473]">
          <span className="font-bold text-white">MacroStack<span className="text-cyan-400">.ai</span></span>
          <span className="text-[#333340]">·</span>
          <span>Zero markup. Zero BS.</span>
        </div>

        <div className="flex items-center gap-6 text-[11px] text-[#646473]">
          <span>100% Independent Price Aggregator</span>
          <span className="text-[#333340]">·</span>
          <span>© {new Date().getFullYear()} MacroStack AI</span>
        </div>
      </div>
    </footer>
  );
}
