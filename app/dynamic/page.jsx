import { connection } from "next/server";

// Stands in for a data fetch (DB query, fetch()).
const load = (i) => new Promise((resolve) => setTimeout(() => resolve(`item ${i}`), 1));

async function Item({ i }) {
  const text = await load(i);
  return <li>{text}</li>;
}

// Dynamic page with a few awaited promises: every render is retained in `next dev`.
export default async function Dynamic() {
  await connection();
  const ids = await Promise.all(Array.from({ length: 10 }, (_, i) => load(i).then(() => i)));
  return (
    <ul>
      {ids.map((i) => (
        <Item key={i} i={i} />
      ))}
    </ul>
  );
}
