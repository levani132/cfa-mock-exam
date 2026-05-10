"use client";

import { useRouter } from "next/navigation";
import { FiArrowLeft, FiHome } from "react-icons/fi";
import { type IconType } from "react-icons";

interface HeaderProps {
  title: string;
  icon?: IconType;
  sticky?: boolean;
  maxWidth?: string;
}

export default function Header({ title, icon: Icon, sticky, maxWidth = "max-w-4xl" }: HeaderProps) {
  const router = useRouter();

  return (
    <header className={`bg-cfa-navy text-white shadow-lg ${sticky ? "sticky top-0 z-30" : ""}`}>
      <div className={`${maxWidth} mx-auto px-6 py-4 flex items-center gap-4`}>
        <div className="flex items-center gap-1">
          <button
            onClick={() => router.back()}
            className="text-gray-300 hover:text-white transition-colors p-1"
            title="Go Back"
          >
            <FiArrowLeft className="text-xl" />
          </button>
          <button
            onClick={() => router.push("/")}
            className="text-gray-300 hover:text-white transition-colors p-1"
            title="Home"
          >
            <FiHome className="text-xl" />
          </button>
        </div>
        <div className="flex items-center gap-3">
          {Icon && <Icon className="text-cfa-gold text-xl" />}
          <h1 className="text-lg font-semibold">{title}</h1>
        </div>
      </div>
    </header>
  );
}
