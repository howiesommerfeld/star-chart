/*
 * A kid's avatar is free text: an emoji ("🦄") or an image path
 * ("/avatars/mickey.png" — drop the file in public/avatars/). Callers wrap
 * this in their own sized circle; images fill it, emoji inherit text size.
 */
export function KidAvatar({ avatar }: { avatar: string }) {
  if (avatar.startsWith("/") || avatar.startsWith("http")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- local static file, no optimizer needed
      <img
        src={avatar}
        alt=""
        className="h-full w-full rounded-full object-cover"
      />
    );
  }
  return <>{avatar}</>;
}
