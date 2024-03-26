
import { describe, expect, it } from "vitest";
import { Cl, IntCV } from "@stacks/transactions";

interface Addresses {
  [key: string]: string
}

const oneDayInBlocks = 47
const accounts = simnet.getAccounts();

const returnAddresses = () => {
  const addresses: Addresses = {}

  for (let index = 1; index < 4; index++) {
    addresses[`address${index}`] = accounts.get(`wallet_${index}`)!;
  }

  return addresses
}

const { address1, address2 } = returnAddresses()

const returnCampaignResources: ()=> Array<IntCV> = () => {
  return Array(4).fill(Cl.int(2000));
}

/*
  The test below is an example. To learn more, read the testing documentation here:
  https://docs.hiro.so/clarinet/feature-guides/test-contract-with-clarinet-sdk
*/

describe("campaigns", () => {
  it("ensures they are well initalised", () => {

    const campaignResponse = simnet.callPublicFn('rts','create-campaign', [Cl.list(returnCampaignResources())], address1)
    expect(campaignResponse.result).toBeOk(Cl.bool(true));

    const printEvent = campaignResponse.events[0]
    const campaign = simnet.getMapEntry('rts','campaigns', Cl.tuple({id: Cl.uint(1)}))
    expect(printEvent.data.value).toBeTuple({
      object: Cl.stringAscii('rts'),
      action: Cl.stringAscii('campaign-created'),
      value: campaign,
    });
  });

  it("does not allow for two simultaneous campaigns", () => {
    simnet.callPublicFn('rts','create-campaign', [Cl.list(returnCampaignResources())], address1)

    const thisFails = simnet.callPublicFn('rts','create-campaign', [Cl.list(returnCampaignResources())], address1)
    expect(thisFails.result).toBeErr(Cl.uint(1));

    const campaignDuration: any = simnet.getDataVar('rts', 'campaing-duration')
    simnet.mineEmptyBlocks(oneDayInBlocks * (Number(campaignDuration.value) + 1))

    const thisDoesntFail = simnet.callPublicFn('rts','create-campaign', [Cl.list(returnCampaignResources())], address1)
    expect(thisDoesntFail.result).toBeOk(Cl.bool(true));

    const thisFailsToo = simnet.callPublicFn('rts','create-campaign', [Cl.list(returnCampaignResources())], address1)
    expect(thisFailsToo.result).toBeErr(Cl.uint(1));
  })

  it("does not allow campaigns with 0 resources", () => {
    const zeroIntList = returnCampaignResources()

    for (let index = 0; index < 3; index++) {
      zeroIntList[index] = Cl.int(0);

      const thisFails = simnet.callPublicFn('rts','create-campaign', [Cl.list(zeroIntList)], address1)

      expect(thisFails.result).toBeErr(Cl.uint(3));
    }

  })

  describe("allow gathering resources", () => {
    it("respecting pawn limit", () => {
      simnet.callPublicFn('rts','create-campaign', [Cl.list(returnCampaignResources())], address1)
      let playerPawnsStateTracker = 100

      for (let index = 0; index < 4; index++) {
        const txResponse: any = (simnet.callPublicFn(
          'rts',
          'send-gathering-expedition',
          [Cl.int(24), Cl.uint(index)],
          address2
        ));

        const playerPawnState = simnet.getMapEntry('rts','player-assets', Cl.tuple({player: Cl.principal(address2)}))
        expect(playerPawnState).toBeSome(Cl.tuple({
          resources: Cl.list(
            [Cl.int(50), Cl.int(50), Cl.int(50), Cl.int(50), Cl.int(50)]
          ),
          pawns: Cl.int(playerPawnsStateTracker-(24 * (index+1))),
          town: Cl.tuple({
            defenses: Cl.list([Cl.int(20), Cl.int(20)]),
            army: Cl.list([Cl.int(0), Cl.int(0), Cl.int(0)])
          })
        }))

        const miningPawnState = simnet.getMapEntry('rts','gathering-expeditions-per-player', Cl.tuple({
          player: Cl.principal(address2),
          "resource-id": Cl.uint(index),
          "expedition-id": Cl.uint(0)
        }))

        const txEventValue: bigint = txResponse.events[0].data.value.value

        expect(miningPawnState).toBeSome(Cl.tuple({
          "pawns-sent": Cl.int(24),
          timestamp: Cl.uint(txEventValue)
        }))
      }

      const thisFails = simnet.callPublicFn('rts','send-gathering-expedition', [Cl.int(7), Cl.uint(0)], address2)
      expect(thisFails.result).toBeErr(Cl.uint(22));

    })

    it("correctly handles sending expeditions", () => {
      simnet.callPublicFn('rts','create-campaign', [Cl.list(returnCampaignResources())], address1)

      for (let i = 0; i < 3; i++) {
        for (let n = 0; n < 4; n++) {
          const txResponse: any = (simnet.callPublicFn(
            'rts',
            'send-gathering-expedition',
            [Cl.int(5), Cl.uint(i)],
            address2
          ));

          const miningPawnState = simnet.getMapEntry('rts','gathering-expeditions-per-player', Cl.tuple({
            player: Cl.principal(address2),
            "resource-id": Cl.uint(i),
            "expedition-id": Cl.uint(n)
          }))

          const txEventValue: bigint = txResponse.events[0].data.value.value

          expect(miningPawnState).toBeSome(Cl.tuple({
            "pawns-sent": Cl.int(5),
            timestamp: Cl.uint(txEventValue)
          }))
        }
      }

    })

  })

});
