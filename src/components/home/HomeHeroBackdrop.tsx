export default function HomeHeroBackdrop() {
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
      <img
        src="/assets/home-stitch-reference.png"
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-55"
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,16,18,0.28)_0%,rgba(15,16,18,0.52)_34%,rgba(15,16,18,0.82)_100%)]" />
      <div className="absolute inset-x-0 top-0 h-24 bg-[linear-gradient(180deg,rgba(0,0,0,0.12),rgba(0,0,0,0))]" />
    </div>
  );
}
