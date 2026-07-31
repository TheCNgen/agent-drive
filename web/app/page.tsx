"use client"

import banner from '@/assets/banner_full.svg'
import loader1 from '@/assets/loader_1.svg'
import loader2 from '@/assets/loader_2.svg'
import loader3 from '@/assets/loader_3.svg'
import Image from 'next/image'
import Link from 'next/link'
import { AuthButton } from './components/auth/cards/card'
import Navbar from './components/global/Navbar'

const FeatureCard = ({ title, description, icon }: { title: string; description: string; icon: any }) => (
  <div className="bg-amber-100 border-2 border-black brutal-shadow-left hover:translate-x-1 hover:translate-y-1 hover:brutal-shadow-center transition-all duration-300 p-6">
    <div className="flex items-start gap-4">
      <Image src={icon} alt="icon" className="w-12 h-12 slow-spin" />
      <div>
        <h3 className="font-anton text-2xl mb-2">{title}</h3>
        <p className="font-freeman text-sm">{description}</p>
      </div>
    </div>
  </div>
);

const Test = () => {

  return (
    <div className='min-h-screen bg-white flex flex-col items-center justify-start pt-16'>
      <Navbar/>
      
      {/* Hero Section */}
      <div className='w-screen h-[400px] max-md:h-[300px] relative overflow-hidden border-b-2 border-black'>
        <Image src={banner} alt='banner' className='absolute bottom-0 left-1/2 -translate-x-1/2 w-[200vw] translate-y-1/2 origin-center slow-spin scale-[2] max-md:scale-[5]' />
        <div className='absolute top-0 left-0 w-full h-full flex flex-col items-center justify-center'>
          <h1 className='heading-text-3 max-md:heading-text-2 text-8xl max-sm:text-5xl font-anton'>
            AGENT DRIVE
          </h1>
          <AuthButton/>
        </div>
      </div>

      {/* Features Section */}
      <section className="w-full max-w-6xl mx-auto px-4 py-16 relative">
        <h2 className="heading-text-2 text-6xl font-anton text-center mb-12">
          FEATURES
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <FeatureCard
            icon={loader1}
            title="MONETIZE YOUR FILES"
            description="Upload your files to the drive and list them on our marketplace — earn directly with x402 payments, no signups or subscriptions required."
          />
          <FeatureCard
            icon={loader2}
            title="VERIFIED BY HCS"
            description="Every transaction and interaction is logged securely using the Hedera Consensus Service, providing a transparent and immutable audit trail."
          />
          <FeatureCard
            icon={loader3}
            title="SHARE & EARN ANYWHERE"
            description="Every file gets a public link you can share on socials. When someone pays to access it, you earn — no gatekeeping, no platforms needed."
          />
        </div>
      </section>

    </div>
  )
}

export default Test