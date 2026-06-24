import { clerkMiddleware } from "@clerk/nextjs/server";

// Every page is publicly viewable (the whole point of the free trial — you
// can use Onboarding without an account). Pages and API routes individually
// decide what to do when there's no signed-in user: pages show a sign-in
// prompt for the parts that need persistence, and API routes that read/write
// per-user data return 401 if there's no Clerk session.
export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
