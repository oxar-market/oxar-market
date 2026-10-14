"use client";

import { useEffect } from "react";
import { TIE_THING } from "@/lib/share";

/**
 * app.oxar.app/tie - короткий адрес торга галстука для постов: «?thing=<uuid>»
 * в конце твита выглядел мусором. Сайт - статика, поэтому переход здесь, в
 * браузере, а не на сервере.
 */
export default function Tie() {
  useEffect(() => {
    window.location.replace(`/?thing=${TIE_THING}`);
  }, []);
  return null;
}
