// Root page: the app lives behind /f/<FAMILY_TOKEN>. A bare hit on the domain
// reveals nothing about the family.
export default function Home() {
  return (
    <main className="flex min-h-dvh items-center justify-center">
      <span className="text-4xl" role="img" aria-label="night sky">
        🌙✨
      </span>
    </main>
  );
}
