/**
 * Who each address is called.
 *
 * The roster is the only thing that decides a name now, so these cases matter:
 * one wrong entry and somebody's notes are signed by somebody else.
 */

import { displayName } from "../shared/access.js";

let pass = 0, fail = 0;
const is = (input, want) => {
  const got = displayName(input);
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${JSON.stringify(input)} → "${got}"${ok ? "" : `   (wanted "${want}")`}`);
};

console.log("\n— the family, by full address —");
is("devonhackwith@gmail.com", "Devon Hackwith");
is("mhealy.dev@gmail.com", "Michael Healy");

console.log("\n— the three given as bare names, whatever the domain —");
is("uktraceyj@gmail.com", "Tracey Hackwith");
is("uktraceyj@outlook.com", "Tracey Hackwith");
is("hhackwith@gmail.com", "Haven Hackwith");
is("ashtonhack@icloud.com", "Ashton Hackwith");

console.log("\n— two addresses, one person —");
is("nick@heyerconception.com", "Nicholas Heyer");
is("nick@heyer.app", "Nicholas Heyer");

console.log("\n— the address as it really arrives —");
is("DevonHackwith@Gmail.com", "Devon Hackwith");        // Access lowercases, but do not depend on it
is("  devonhackwith@gmail.com  ", "Devon Hackwith");    // stray whitespace
is("devonhackwith+recipes@gmail.com", "Devon Hackwith"); // plus-addressing is the same mailbox

console.log("\n— nick is only nick at his own domains —");
is("nick@example.com", "Nick");                          // not on the roster, so named from the address

console.log("\n— anybody not listed still gets a readable name —");
is("someone.new@example.com", "Someone New");
is("jane_doe@example.com", "Jane Doe");
is("a-b-c@example.com", "A B C");

console.log("\n— and nothing at all does not throw —");
is("", "Someone");
is(null, "Someone");
is(undefined, "Someone");
is("@example.com", "Someone");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
