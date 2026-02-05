import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "ProSmart Factories - Technical Assistant Demo",
  description: "Chatbot RAG técnico que responde preguntas usando documentación PDF cargada por el usuario",
  keywords: ["RAG", "chatbot", "technical assistant", "PDF", "AI"],
  authors: [{ name: "ProSmart Factories" }],
  openGraph: {
    title: "ProSmart Factories - Technical Assistant Demo",
    description: "Asistente técnico inteligente basado en documentación",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
