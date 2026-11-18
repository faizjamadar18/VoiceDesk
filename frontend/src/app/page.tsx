import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import TimeSavingsSection from "@/components/TimeSavingsSection";
import ProductivityGraphSection from "@/components/ProductivityGraphSection";
import VoiceToActionSection from "@/components/VoiceToActionSection";
import StopLookingSection from "@/components/StopLookingSection";
import StayOnTaskSection from "@/components/StayOnTaskSection";
import PrivacySection from "@/components/PrivacySection";
import WallOfLoveSection from "@/components/WallOfLoveSection";
import FaqSection from "@/components/FaqSection";
import PreFooterCtaSection from "@/components/PreFooterCtaSection";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <main className="min-h-screen bg-transparent relative selection:bg-blue-200">
      <Navbar />
      <HeroSection />
      <TimeSavingsSection />
      <ProductivityGraphSection />
      <VoiceToActionSection />
      <StopLookingSection />
      <StayOnTaskSection />
      <PrivacySection />
      <WallOfLoveSection />
      <FaqSection />
      <PreFooterCtaSection />
      <Footer />
    </main>
  );
}
