import Link from "next/link";
export default function NotFound() {
  return (
    <div className="narrow-page">
      <div className="panel empty-state">
        <h1 style={{ fontSize: 32 }}>This page isn’t on the menu.</h1>
        <p>Let’s find you something good.</p>
        <Link className="button primary" href="/">
          Back to Discover
        </Link>
      </div>
    </div>
  );
}
