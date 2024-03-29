
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
          timestamp: Cl.uint(txEventValue),
          refining: Cl.list([Cl.int(0), Cl.int(0)])
        }))
      }

      const thisFails = simnet.callPublicFn('rts','send-gathering-expedition', [Cl.int(7), Cl.uint(0)], address2)
      expect(thisFails.result).toBeErr(Cl.uint(22));
    })

    it("correctly handles sending/returning expeditions", () => {
      simnet.callPublicFn('rts','create-campaign', [Cl.list(returnCampaignResources())], address1)

      const miningPawnState: any = {}

      for (let i = 0; i <= 3; i++) {
        miningPawnState[`resource-${i}`] = {}
        for (let n = 0; n < 4; n++) {
          const txResponse: any = (simnet.callPublicFn(
            'rts',
            'send-gathering-expedition',
            [Cl.int(5), Cl.uint(i)],
            address2
          ));

          miningPawnState[`resource-${i}`][`expedition-${n}`] = simnet.getMapEntry('rts','gathering-expeditions-per-player', Cl.tuple({
            player: Cl.principal(address2),
            "resource-id": Cl.uint(i),
            "expedition-id": Cl.uint(n)
          }))

          const txEventValue: bigint = txResponse.events[0].data.value.value

          expect(miningPawnState[`resource-${i}`][`expedition-${n}`]).toBeSome(Cl.tuple({
            "pawns-sent": Cl.int(5),
            timestamp: Cl.uint(txEventValue),
            refining: Cl.list([Cl.int(0), Cl.int(0)])
          }))
        }
      }

      simnet.mineEmptyBlocks(oneDayInBlocks)

      const baseValues = Array(5).fill(50)
      let pawnTracker = 20
      for (let i = 0; i <= 3; i++) {
        for (let n = 0; n < 4; n++) {
          simnet.mineEmptyBlocks(20)

          const expeditionData: any = (simnet.callReadOnlyFn(
            "rts",
            "get-gathering-expeditions-per-player",
            [Cl.principal(address2), Cl.uint(i), Cl.uint(n)],
            address2)).result

          const txResponse: any = simnet.callPublicFn(
            'rts',
            'return-gathering-expedition',
            [Cl.uint(i), Cl.uint(n)],
            address2
          );
          const txEventValue: bigint = txResponse.events[0].data.value.value

          const gatheredResource: any = (simnet.callReadOnlyFn("rts","get-gathered-resource",
          [
            Cl.int(expeditionData.data['pawns-sent'].value),
            Cl.uint(i),
            Cl.uint(txEventValue)
          ],
            address2)
          ).result

          const newPlayerState = (simnet.callReadOnlyFn("rts","get-player", [Cl.principal(address2)], address2)).result

          baseValues[i] += Number(gatheredResource.value)
          const resourcesList = [Cl.int(baseValues[0]), Cl.int(baseValues[1]), Cl.int(baseValues[2]), Cl.int(baseValues[3]), Cl.int(baseValues[4])]

          pawnTracker += 5

          expect(newPlayerState).toBeTuple({
            pawns: Cl.int(pawnTracker),
            resources: Cl.list(resourcesList),
            town: Cl.tuple({
              army: Cl.list([Cl.int(0), Cl.int(0), Cl.int(0)]),
              defenses: Cl.list([Cl.int(20), Cl.int(20)])
            })
          })
        }
      }
    })

    it("Allows resource refining, respecting due process", () => {
      simnet.callPublicFn('rts','create-campaign', [Cl.list(returnCampaignResources())], address1)

      const firstPlayerState = (simnet.callReadOnlyFn("rts","get-player", [Cl.principal(address2)], address2)).result
      expect(firstPlayerState).toBeTuple({
        pawns: Cl.int(100),
        resources: Cl.list([Cl.int(50), Cl.int(50), Cl.int(50), Cl.int(50), Cl.int(50)]),
        town: Cl.tuple({
          army: Cl.list([Cl.int(0), Cl.int(0), Cl.int(0)]),
          defenses: Cl.list([Cl.int(20), Cl.int(20)])
        })
      })

      const thisFailsWoodHigh: any = simnet.callPublicFn(
        'rts',
        'refine-resources',
        [Cl.int(80), Cl.int(50)],
        address2
      );
      expect(thisFailsWoodHigh.result).toBeErr(Cl.uint(24))
      const thisFailsWoodLow: any = simnet.callPublicFn(
        'rts',
        'refine-resources',
        [Cl.int(5), Cl.int(50)],
        address2
      );
      expect(thisFailsWoodLow.result).toBeErr(Cl.uint(24))
      const thisFailsRockHigh: any = simnet.callPublicFn(
        'rts',
        'refine-resources',
        [Cl.int(50), Cl.int(80)],
        address2
      );
      expect(thisFailsRockHigh.result).toBeErr(Cl.uint(25))
      const thisFailsRockLow: any = simnet.callPublicFn(
        'rts',
        'refine-resources',
        [Cl.int(50), Cl.int(5)],
        address2
      );
      expect(thisFailsRockLow.result).toBeErr(Cl.uint(25))

      const woodSent = 30
      const rockSent = 21

      const thisFailsNumberNotInRelationship = simnet.callPublicFn(
        'rts',
        'refine-resources',
        [Cl.int(10), Cl.int(14)],
        address2
      );
      expect(thisFailsNumberNotInRelationship.result).toBeErr(Cl.uint(32))

      const sendResourcesToRefine: any = simnet.callPublicFn(
        'rts',
        'refine-resources',
        [Cl.int(woodSent), Cl.int(rockSent)],
        address2
      );
      expect(sendResourcesToRefine.result).toBeOk(Cl.bool(true))
      const miningPawnState = simnet.getMapEntry('rts','gathering-expeditions-per-player', Cl.tuple({
        player: Cl.principal(address2),
        "resource-id": Cl.uint(4),
        "expedition-id": Cl.uint(0)
      }))
      expect(miningPawnState).toBeSome(Cl.tuple({
        "pawns-sent": Cl.int(10),
        refining: Cl.list([ Cl.int(woodSent),  Cl.int(rockSent)]),
        timestamp: Cl.uint(sendResourcesToRefine.events[0].data.value.value)
      }))

      const thisFailsTooSoon: any = simnet.callPublicFn(
        'rts',
        'refine-resources',
        [Cl.int(10), Cl.int(7)],
        address2
      );
      expect(thisFailsTooSoon.result).toBeErr(Cl.uint(31))

      const newPlayerState = (simnet.callReadOnlyFn("rts","get-player", [Cl.principal(address2)], address2)).result
      expect(newPlayerState).toBeTuple({
        pawns: Cl.int(90),
        resources: Cl.list([Cl.int(50 - woodSent), Cl.int(50 - rockSent), Cl.int(50), Cl.int(50), Cl.int(50)]),
        town: Cl.tuple({
          army: Cl.list([Cl.int(0), Cl.int(0), Cl.int(0)]),
          defenses: Cl.list([Cl.int(20), Cl.int(20)])
        })
      })

      simnet.mineEmptyBlocks(3)

      const collectMetal = simnet.callPublicFn(
        'rts',
        'refine-resources',
        [Cl.int(0), Cl.int(0)],
        address2
      );
      expect(collectMetal.result).toBeOk(Cl.bool(true))

      const refinedMetal = Number(Math.floor((woodSent * rockSent) / 12).toFixed(0))

      const finalPlayerState = (simnet.callReadOnlyFn("rts","get-player", [Cl.principal(address2)], address2)).result
      expect(finalPlayerState).toBeTuple({
        pawns: Cl.int(100),
        resources: Cl.list([Cl.int(50 - woodSent), Cl.int(50 - rockSent), Cl.int(50), Cl.int(50), Cl.int(50+refinedMetal)]),
        town: Cl.tuple({
          army: Cl.list([Cl.int(0), Cl.int(0), Cl.int(0)]),
          defenses: Cl.list([Cl.int(20), Cl.int(20)])
        })
      })
      const finalMiningPawnState = simnet.getMapEntry('rts','gathering-expeditions-per-player', Cl.tuple({
        player: Cl.principal(address2),
        "resource-id": Cl.uint(4),
        "expedition-id": Cl.uint(0)
      }))
      expect(finalMiningPawnState).toBeSome(Cl.tuple({
        "pawns-sent": Cl.int(0),
        refining: Cl.list([ Cl.int(0),  Cl.int(0)]),
        timestamp: Cl.uint(0)
      }))
    })

  })
});
