export default function HomeHeroBackdrop() {
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
      <img
        src="/assets/home-stitch-reference.png"
        alt=""
        className="absolute inset-0 h-full w-full scale-[1.04] object-cover opacity-40 blur-[2px]"
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,16,18,0.46)_0%,rgba(14,15,16,0.6)_28%,rgba(15,16,18,0.82)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0)_44%)]" />
      <div className="absolute inset-y-[8%] left-[2%] hidden w-[23%] rounded-[28px] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.01))] opacity-50 blur-sm lg:block" />
      <div className="absolute right-[4%] top-[9%] hidden h-[42%] w-[24%] rounded-[30px] bg-[linear-gradient(180deg,rgba(86,212,123,0.1),rgba(15,18,16,0.02))] opacity-55 blur-sm lg:block" />
      <div className="absolute inset-x-0 top-0 h-20 bg-[linear-gradient(180deg,rgba(0,0,0,0.14),rgba(0,0,0,0))]" />
    </div>
  );
}
