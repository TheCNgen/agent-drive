import connectDB from '../app/lib/mongodb';
import { Listing } from '../app/models/Listing';
import { SharedLink } from '../app/models/SharedLink';
import { Transaction } from '../app/models/Transaction';
import { Commission } from '../app/models/Commission';
import { hbarToTinybars } from '../app/lib/money';

async function main() {
  await connectDB();

  let listingCount = 0;
  let sharedLinkCount = 0;

  const listings = await Listing.collection.find({ price: { $exists: true } }).toArray();
  for (const listing of listings) {
    if (typeof listing.price === 'number') {
      try {
        let priceStr = String(listing.price);
        if (!/^\d+(\.\d{1,8})?$/.test(priceStr)) {
          console.warn(`Listing ${listing._id} price ${listing.price} invalid format, rounding...`);
          priceStr = Number(listing.price).toFixed(8).replace(/\.?0+$/, '');
        }
        const priceTinybars = hbarToTinybars(priceStr);
        await Listing.collection.updateOne(
          { _id: listing._id },
          { 
            $set: { priceTinybars },
            $unset: { price: "" }
          }
        );
        listingCount++;
      } catch (err) {
        console.error(`Listing ${listing._id} error:`, err);
      }
    }
  }

  const links = await SharedLink.collection.find({ type: 'monetized', price: { $exists: true } }).toArray();
  for (const link of links) {
    if (typeof link.price === 'number') {
      try {
        let priceStr = String(link.price);
        if (!/^\d+(\.\d{1,8})?$/.test(priceStr)) {
          console.warn(`SharedLink ${link._id} price ${link.price} invalid format, rounding...`);
          priceStr = Number(link.price).toFixed(8).replace(/\.?0+$/, '');
        }
        const priceTinybars = hbarToTinybars(priceStr);
        await SharedLink.collection.updateOne(
          { _id: link._id },
          { 
            $set: { priceTinybars },
            $unset: { price: "" }
          }
        );
        sharedLinkCount++;
      } catch (err) {
        console.error(`SharedLink ${link._id} error:`, err);
      }
    }
  }

  const txRes = await Transaction.collection.deleteMany({});
  const commRes = await Commission.collection.deleteMany({});

  console.log(`Migrated ${listingCount} listings.`);
  console.log(`Migrated ${sharedLinkCount} shared links.`);
  console.log(`Deleted ${txRes.deletedCount} transactions.`);
  console.log(`Deleted ${commRes.deletedCount} commissions.`);
  
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
