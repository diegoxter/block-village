
import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

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

const {address1, address2, } = returnAddresses()

/*
  The test below is an example. To learn more, read the testing documentation here:
  https://docs.hiro.so/clarinet/feature-guides/test-contract-with-clarinet-sdk
*/

describe("campaigns", () => {
  it("ensures they are well initalised", () => {
    const campaignResponse = simnet.callPublicFn('rts','create-campaign', [], address1)
    expect(campaignResponse.result).toBeOk(Cl.bool(true));

    const printEvent = campaignResponse.events[0]
    const campaign = simnet.getMapEntry('rts','campaigns', Cl.tuple({id: Cl.uint(1)}))
    expect(printEvent.data.value).toBeTuple({
      object: Cl.stringAscii('rts'),
      action: Cl.stringAscii('campaign-created'),
      value: campaign,
    });
  });

  it("does not allow fow two simultaneous campaigns", () => {
    simnet.callPublicFn('rts','create-campaign', [], address1)

    const thisFails = simnet.callPublicFn('rts','create-campaign', [], address1)
    expect(thisFails.result).toBeErr(Cl.uint(1));

    const campaignDuration = simnet.getDataVar('rts', 'campaing-duration')
    simnet.mineEmptyBlocks(oneDayInBlocks * (Number(campaignDuration.value) + 1))

    const thisDoesntFail = simnet.callPublicFn('rts','create-campaign', [], address1)
    expect(thisDoesntFail.result).toBeOk(Cl.bool(true));

    const thisFailsToo = simnet.callPublicFn('rts','create-campaign', [], address1)
    expect(thisFailsToo.result).toBeErr(Cl.uint(1));
  })

  describe("allow gathering resources", () => {
    it("respecting pawn limit", ()=> {
      simnet.callPublicFn('rts','create-campaign', [], address1)
      const miningArray = [Cl.int(0), Cl.int(0), Cl.int(0), Cl.int(0)]
      let playerPawnsStateTracker = 100

      for (let index = 0; index < 4; index++) {
        (simnet.callPublicFn(
          'rts',
          'gather-resource',
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

        const miningPawnState = simnet.getMapEntry('rts','pawns-occupied-per-player', Cl.tuple({player: Cl.principal(address2)}))
        miningArray[index] = Cl.int(24)
        expect(miningPawnState).toBeSome(Cl.tuple({
          resources: Cl.list(miningArray)
        }))
      }

      const thisFails = simnet.callPublicFn('rts','gather-resource', [Cl.int(7), Cl.uint(0)], address2)
      expect(thisFails.result).toBeErr(Cl.uint(22));

    })
  })

});
