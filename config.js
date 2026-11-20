// Website settings that must be set in code.
// Leave supabaseUrl and supabaseKey empty to run the website in demo mode
// (sample data, saved only in the visitor's browser).
//
// Values from: Supabase dashboard -> Project Settings -> API Keys
//   supabaseUrl: the project URL
//   supabaseKey: the "publishable" key. This key is meant to be public.
//   NEVER put the "secret" / "service_role" key here.
window.SITE_CONFIG = {
  supabaseUrl: 'https://membertqugfwotwnzjaz.supabase.co',
  supabaseKey: 'sb_publishable_0WclXuOH7zAYUCgLGayJCw_ps69HilD',
  // Where the demo finds its sample exercises (used only in demo mode).
  demoExerciseBase: 'https://dasha-english-teacher.github.io/miro-exercises/',
};
