import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error(
    "Supabase 환경변수가 설정되지 않았습니다. .env.example을 .env로 복사하고 " +
    "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY를 채워주세요."
  );
}

export const supabase = createClient(url, anonKey);
