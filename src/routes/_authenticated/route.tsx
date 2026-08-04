import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      // Remember where the user was heading so sign-in returns them there
      // instead of always dumping them on the dashboard.
      throw redirect({
        to: "/auth",
        search: { redirect: location.href },
        replace: true,
      });
    }
    return { user: data.user };
  },
  component: () => <Outlet />,
});
