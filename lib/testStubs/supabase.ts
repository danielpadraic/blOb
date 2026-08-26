export const isSupabaseConfigured = false;
export const supabase = {
  from() {
    return {
      select() {
        return this;
      },
      eq() {
        return this;
      },
      order() {
        return this;
      },
      maybeSingle: async () => ({ data: null, error: null }),
    };
  },
};
