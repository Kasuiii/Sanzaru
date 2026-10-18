import type { Metadata } from "next";
import "./globals.css";
import "./sanzaru.css";
import "./academy.css";
import "./asl.css";

export const metadata: Metadata = {
  title: "SANZARU — Hand to Heart",
  description: "เกมร่วมมือ 3 คน ฝึกอักษรภาษามือ ASL ผ่าน Three Wise Monkeys ส่งต่อด้วยมือ อักษร และเสียง เพื่อเปิดตราผนึกทั้งห้า พร้อมตัวช่วยการเข้าถึงที่เลือกได้",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body className="antialiased">{children}</body>
    </html>
  );
}
