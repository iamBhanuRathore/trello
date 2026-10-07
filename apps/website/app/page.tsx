import Hero from '@/components/sections/Hero';
import Panels from '@/components/sections/Panels';
import DomainModel from '@/components/sections/DomainModel';
import CardPeople from '@/components/sections/CardPeople';
import Planning from '@/components/sections/Planning';
import Stages from '@/components/sections/Stages';
import Views from '@/components/sections/Views';
import PowerFeatures from '@/components/sections/PowerFeatures';
import Security from '@/components/sections/Security';
import Stack from '@/components/sections/Stack';
import Roadmap from '@/components/sections/Roadmap';
import Pricing from '@/components/sections/Pricing';

export default function Home() {
  return (
    <>
      <Hero />
      <Panels />
      <DomainModel />
      <CardPeople />
      <Planning />
      <Stages />
      <Views />
      <PowerFeatures />
      <Security />
      <Stack />
      <Roadmap />
      <Pricing />
    </>
  );
}
