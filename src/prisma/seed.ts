import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const faculties = [
    { code: '01', name: 'คณะวิศวกรรมศาสตร์' },
    { code: '02', name: 'คณะสถาปัตยกรรม ศิลปะและการออกแบบ' },
    { code: '03', name: 'คณะครุศาสตร์อุตสาหกรรมและเทคโนโลยี' },
    { code: '04', name: 'คณะเทคโนโลยีการเกษตร' },
    { code: '05', name: 'คณะวิทยาศาสตร์' },
    { code: '06', name: 'คณะอุตสาหกรรมอาหาร' },
    { code: '07', name: 'คณะเทคโนโลยีสารสนเทศ' },
    { code: '08', name: 'foin???' },
    { code: '09', name: 'not found???' },
    { code: '10', name: 'คณะบริหารธุรกิจ' },
    //bs แต่มีเมลมอ นับมั้ยวะไอสาส
    { code: '11', name: 'วิทยาลัยเทคโนโลยีและนวัตกรรมวัสดุ' },
    { code: '12', name: 'วิทยาลัยนวัตกรรมการผลิตขั้นสูง' },
    { code: '13', name: 'วิทยาลัยอุตสาหกรรมการบินนานาชาติ' },
    { code: '14', name: 'คณะศิลปศาสตร์' },
    { code: '15', name: 'คณะแพทย์ศาสตร์' },
    { code: '16', name: 'วิทยาลัยวิศวกรรมสังคีต' },
    { code: '17', name: 'คณะทันตแพทยศาสตร์' },
    { code: '18', name: 'not found???' },
    //ชุมพรว่าไง
    // Add the others you want here!
  ];

  for (const faculty of faculties) {
    // What Prisma method lets you create or update if it already exists?
    // Hint: upsert
    await prisma.faculty.upsert({
      where: { code: faculty.code },
      update: {},
      create: {
        code: faculty.code,
        name: faculty.name,
      },
    });
  }

  console.log('🌱 Seeding completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
