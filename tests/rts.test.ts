
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

const { address1, address2, address3 } = returnAddresses()

const returnCampaignResources: ()=> Array<IntCV> = () => {
  return Array(4).fill(Cl.int(2000));
}

const returnUnitResourceCostIndex: (index: number) => number[] = (index) => {
  switch (index) {
    case 0:
      return [1, 5];

    case 1:
      return [0, 4];

    case 2:
      return [2, 8];

    default:
      return [];
  }
}

const returnResources = () => { return Array(5).fill(50) }

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
          "last-raid": Cl.uint(0),
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
            "last-raid": Cl.uint(0),
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
        "last-raid": Cl.uint(0),
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
        "last-raid": Cl.uint(0),
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
        "last-raid": Cl.uint(0),
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

  describe("allow pawn occupation...", () => {
    describe("...military activities", () => {
      it("like training, respecting limits", () => {
        simnet.callPublicFn('rts','create-campaign', [Cl.list(returnCampaignResources())], address1)

        const trainingAmount = 6
        const armyArray = [0, 0, 0]
        const trainingTimestamps = [0, 0, 0]
        const trainingObjectsArray = [
          {
            "pawns-training": Cl.int(armyArray[0]),
            timestamp: Cl.uint(trainingTimestamps[0])
          },
          {
            "pawns-training": Cl.int(armyArray[1]),
            timestamp: Cl.uint(trainingTimestamps[1])
          },
          {
            "pawns-training": Cl.int(armyArray[2]),
            timestamp: Cl.uint(trainingTimestamps[2])
          }
        ]

        for (let index = 0; index < 3; index++) {
          const txResponse: any = simnet.callPublicFn(
            'rts',
            'train-soldiers',
            [Cl.uint(index), Cl.int(trainingAmount)],
            address2
          );
          expect(txResponse.result).toBeOk(Cl.int(trainingAmount))

          const txEventValue: bigint = txResponse.events[0].data.value.value

          armyArray[index] += trainingAmount
          trainingObjectsArray[index]['timestamp'] = Cl.uint(txEventValue)
          trainingObjectsArray[index]['pawns-training'] = Cl.int(trainingAmount)

          const trainingData: any = (simnet.callReadOnlyFn(
            "rts",
            "get-occupied-units-per-player",
            [],
            address2)
          ).result

          expect(trainingData).toBeTuple({
            repairing: Cl.tuple({
              pawns: Cl.int(0),
              timestamp: Cl.uint(0)
            }),
            training: Cl.list([
              Cl.tuple(trainingObjectsArray[0]),
              Cl.tuple(trainingObjectsArray[1]),
              Cl.tuple(trainingObjectsArray[2])
            ])
          })
        }

        for (let index = 0; index < 3; index++) {
          const endTraining = simnet.callPublicFn(
            'rts',
            'train-soldiers',
            [Cl.uint(index), Cl.int(0)],
            address2
          ).result;
          expect(endTraining).toBeOk(Cl.int(trainingAmount))

          const trainingData: any = (simnet.callReadOnlyFn(
            "rts",
            "get-occupied-units-per-player",
            [],
            address2)
          ).result

          trainingObjectsArray[index]['timestamp'] = Cl.uint(0)
          trainingObjectsArray[index]['pawns-training'] = Cl.int(0)

          expect(trainingData).toBeTuple({
            repairing: Cl.tuple({
              pawns: Cl.int(0),
              timestamp: Cl.uint(0)
            }),
            training: Cl.list([
              Cl.tuple(trainingObjectsArray[0]),
              Cl.tuple(trainingObjectsArray[1]),
              Cl.tuple(trainingObjectsArray[2])
            ])
          })
        }

        const lastPlayerState = (simnet.callReadOnlyFn("rts","get-player", [Cl.principal(address2)], address2)).result

        expect(lastPlayerState).toBeTuple({
          "last-raid": Cl.uint(0),
          pawns: Cl.int(100 - (trainingAmount * 3)),
          resources: Cl.list([Cl.int(50 - (trainingAmount * 4)), Cl.int(50 - (trainingAmount * 5)), Cl.int(50 - (trainingAmount * 8)), Cl.int(50), Cl.int(50)]),
          town: Cl.tuple({
            army: Cl.list([Cl.int(armyArray[0]), Cl.int(armyArray[1]), Cl.int(armyArray[2])]),
            defenses: Cl.list([Cl.int(20), Cl.int(20)])
          })
        })
      })

      it("and raids!", () => {
        simnet.callPublicFn('rts','create-campaign', [Cl.list(returnCampaignResources())], address1)
        const trainingAmount = 5
        for (let index = 0; index < 3; index++) { // get some army
          simnet.callPublicFn(
            'rts',
            'train-soldiers',
            [Cl.uint(index), Cl.int(trainingAmount)],
            address2
          );

          simnet.mineEmptyBlocks(5)

          expect(simnet.callPublicFn(
            'rts',
            'train-soldiers',
            [Cl.uint(index), Cl.int(0)],
            address2
          ).result).toBeOk(Cl.int(5))
        }

        const thisFails = simnet.callPublicFn(
          'rts',
          'send-raid',
          [Cl.principal(address3), Cl.list(Array(3).fill(Cl.int(0)))],
          address2
        )
        expect(thisFails.result).toBeErr(Cl.uint(43))

        const raidArmyAmount = 2
        const txResponse: any = simnet.callPublicFn(
          'rts',
          'send-raid',
          [Cl.principal(address3), Cl.list(Array(3).fill(Cl.int(raidArmyAmount)))],
          address2
        )
        const txEventValue: bigint = txResponse.events[0].data.value.value
        expect(txResponse.result).toBeOk(Cl.bool(true))

        const thisFailsToo = simnet.callPublicFn(
          'rts',
          'send-raid',
          [Cl.principal(address1), Cl.list(Array(3).fill(Cl.int(raidArmyAmount+3)))],
          address2
        )
        // Because there are no more soldiers to send
        expect(thisFailsToo.result).toBeErr(Cl.uint(43))

        const invaderState = (simnet.callReadOnlyFn("rts","get-player", [Cl.principal(address2)], address2)).result

        const remainingArmy = trainingAmount- raidArmyAmount
        expect(invaderState).toBeTuple({
          "last-raid": Cl.uint(0),
          pawns: Cl.int(100 - (trainingAmount * 3)),
          resources: Cl.list([Cl.int(50 - (trainingAmount * 4)), Cl.int(50 - (trainingAmount * 5)), Cl.int(50 - (trainingAmount * 8)), Cl.int(50), Cl.int(50)]),
          town: Cl.tuple({
            army: Cl.list(Array(3).fill(Cl.int(remainingArmy))),
            defenses: Cl.list([Cl.int(20), Cl.int(20)])
          })
        })

        const defenderState = (simnet.callReadOnlyFn("rts","get-player", [Cl.principal(address3)], address2)).result
        expect(defenderState).toBeTuple({
          "last-raid": Cl.uint(txEventValue),
          pawns: Cl.int(100),
          resources: Cl.list([Cl.int(50), Cl.int(50), Cl.int(50), Cl.int(50), Cl.int(50)]),
          town: Cl.tuple({
            army: Cl.list(Array(3).fill(Cl.int(0))),
            defenses: Cl.list([Cl.int(20), Cl.int(20)])
          })
        })

        const initialRaidStatus = simnet.getMapEntry('rts', 'raids', Cl.tuple({
          invader: Cl.principal(address2),
          defender: Cl.principal(address3)
        }))
        expect(initialRaidStatus).toBeSome(Cl.tuple({
          army: Cl.list(Array(3).fill(Cl.int(raidArmyAmount))),
          success: Cl.none(),
          timestamp: Cl.uint(txEventValue)
        }))
      })
    })

    it("raids respect the time limit", () => {
      simnet.callPublicFn('rts','create-campaign', [Cl.list(returnCampaignResources())], address1)
      const trainingAmount = 5
      for (let index = 0; index < 3; index++) { // get some army
        simnet.callPublicFn(
          'rts',
          'train-soldiers',
          [Cl.uint(index), Cl.int(trainingAmount)],
          address2
        );

        simnet.mineEmptyBlocks(5)

        simnet.callPublicFn(
          'rts',
          'train-soldiers',
          [Cl.uint(index), Cl.int(0)], // we are claiming the trained soldiers here
          address2
        )
      }
      const thisPass: any = simnet.callPublicFn(
        'rts',
        'send-raid',
        [Cl.principal(address3), Cl.list(Array(3).fill(Cl.int(2)))],
        address2
      )
      const txEventValue: bigint = thisPass.events[0].data.value.value

      const initialRaidStatus = simnet.getMapEntry('rts', 'raids', Cl.tuple({
        invader: Cl.principal(address2),
        defender: Cl.principal(address3)
      }))
      expect(initialRaidStatus).toBeSome(Cl.tuple(
        {
          army: Cl.list(Array(3).fill(Cl.int(2))),
          success: Cl.none(),
          timestamp: Cl.uint(txEventValue)
        })
      )

      const thisFails = simnet.callPublicFn(
        'rts',
        'send-raid',
        [Cl.principal(address3), Cl.list(Array(3).fill(Cl.int(2)))],
        address2
      )
      expect(thisFails.result).toBeErr(Cl.uint(45))

      simnet.mineEmptyBlocks(6)

      const txResponse = simnet.callPublicFn(
        'rts',
        'return-raid',
        [Cl.principal(address3)],
        address2
      )
      expect(txResponse.result).toBeOk(Cl.bool(true))
      const finalRaidStatus = simnet.getMapEntry('rts', 'raids', Cl.tuple({
        invader: Cl.principal(address2),
        defender: Cl.principal(address3)
      }))
      expect(finalRaidStatus).toBeSome(Cl.tuple(
        {
          army: Cl.list(Array(3).fill(Cl.int(0))),
          success: Cl.some(Cl.bool(true)),
          timestamp: Cl.uint(txEventValue)
        })
      )

      const thisFailsToo: any = simnet.callPublicFn(
        'rts',
        'send-raid',
        [Cl.principal(address3), Cl.list(Array(3).fill(Cl.int(2)))],
        address2
      )
      expect(thisFailsToo.result).toBeErr(Cl.uint(44))
    })

    it("raids calculate the winner based on unit amount", () => {
      simnet.callPublicFn('rts','create-campaign', [Cl.list(returnCampaignResources())], address1)
      const trainingAmount = 5
      for (let index = 0; index < 3; index++) { // get some army
        simnet.callPublicFn(
          'rts',
          'train-soldiers',
          [Cl.uint(index), Cl.int(trainingAmount)],
          address2
        );
        // defender's defense
        simnet.callPublicFn(
          'rts',
          'train-soldiers',
          [Cl.uint(index), Cl.int(2)],
          address3
        );

        simnet.mineEmptyBlocks(5)

        simnet.callPublicFn(
          'rts',
          'train-soldiers',
          [Cl.uint(index), Cl.int(0)],
          address2
        )
        // defender's defense
        simnet.callPublicFn(
          'rts',
          'train-soldiers',
          [Cl.uint(index), Cl.int(0)],
          address3
        )
      }

      const sendRaid: any = simnet.callPublicFn(
        'rts',
        'send-raid',
        [Cl.principal(address3), Cl.list(Array(3).fill(Cl.int(5)))],
        address2
      )
      const txEventValue: bigint = sendRaid.events[0].data.value.value

      simnet.mineEmptyBlocks(7)

      simnet.callPublicFn(
        'rts',
        'return-raid',
        [Cl.principal(address3)],
        address2
      )

      const firstRaidStatus = simnet.getMapEntry('rts', 'raids', Cl.tuple({
        invader: Cl.principal(address2),
        defender: Cl.principal(address3)
      }))
      expect(firstRaidStatus).toBeSome(Cl.tuple(
        {
          army: Cl.list(Array(3).fill(Cl.int(0))),
          success: Cl.some(Cl.bool(true)),
          timestamp: Cl.uint(txEventValue)
        })
      )

      const sendSecondRaid: any = simnet.callPublicFn(
        'rts',
        'send-raid',
        [Cl.principal(address2), Cl.list(Array(3).fill(Cl.int(2)))],
        address3
      )
      const secondRaidEventValue: bigint = sendSecondRaid.events[0].data.value.value
      simnet.mineEmptyBlocks(7)

      const txResponse = simnet.callPublicFn(
        'rts',
        'return-raid',
        [Cl.principal(address2)],
        address3
      )
      expect(txResponse.result).toBeOk(Cl.bool(true))

      const finalRaidStatus = simnet.getMapEntry('rts', 'raids', Cl.tuple({
        invader: Cl.principal(address3),
        defender: Cl.principal(address2)
      }))
      expect(finalRaidStatus).toBeSome(Cl.tuple(
        {
          army: Cl.list(Array(3).fill(Cl.int(0))),
          success: Cl.some(Cl.bool(false)),
          timestamp: Cl.uint(secondRaidEventValue)
        })
      )


    })

    it("raids calculate the loot - for winners", () => {
      simnet.callPublicFn('rts','create-campaign', [Cl.list(returnCampaignResources())], address1)
      const trainingAmount = 5

      const firstPlayerResources = returnResources()
      const secondPlayerResources = returnResources()

      for (let index = 0; index < 3; index++) { // get some army
        simnet.callPublicFn(
          'rts',
          'train-soldiers',
          [Cl.uint(index), Cl.int(trainingAmount)],
          address2
        );
        const [i, amount] = returnUnitResourceCostIndex(index)
        firstPlayerResources[i] -= amount * trainingAmount // aqui
        // defender's defense
        simnet.callPublicFn(
          'rts',
          'train-soldiers',
          [Cl.uint(index), Cl.int(2)],
          address3
        );
        secondPlayerResources[i] -= amount * (trainingAmount - 3)
        simnet.mineEmptyBlocks(5)

        simnet.callPublicFn(
          'rts',
          'train-soldiers',
          [Cl.uint(index), Cl.int(0)],
          address2
        )
        // defender's defense
        simnet.callPublicFn(
          'rts',
          'train-soldiers',
          [Cl.uint(index), Cl.int(0)],
          address3
        )
      }

      const tx: any = simnet.callPublicFn(
        'rts',
        'send-raid',
        [Cl.principal(address3), Cl.list(Array(3).fill(Cl.int(5)))],
        address2
      )
      const txEventValue: bigint = tx.events[0].data.value.value

      simnet.mineEmptyBlocks(7)

      simnet.callPublicFn(
        'rts',
        'return-raid',
        [Cl.principal(address3)],
        address2
      )

      const firstPlayerState = (simnet.callReadOnlyFn("rts","get-player", [Cl.principal(address2)], address2)).result
      const secondPlayerState = (simnet.callReadOnlyFn("rts","get-player", [Cl.principal(address3)], address3)).result
      expect(firstPlayerState).toBeTuple({
        "last-raid": Cl.uint(0),
        resources: Cl.list(Array(5).fill(null).map((_, index) => {
          return Cl.int(firstPlayerResources[index] + Math.floor((secondPlayerResources[index]*10)/100));
        })),
        pawns: Cl.int(85),
        town: Cl.tuple({
          defenses: Cl.list([Cl.int(20), Cl.int(20)]),
          army: Cl.list(Array(3).fill(Cl.int(trainingAmount)))
        })
      })
      expect(secondPlayerState).toBeTuple({
        "last-raid": Cl.uint(txEventValue),
        resources: Cl.list(Array(5).fill(null).map((_, index) => {
          return Cl.int(secondPlayerResources[index] - Math.floor((secondPlayerResources[index]*10)/100));
        })),
        pawns: Cl.int(94),
        town: Cl.tuple({
          defenses: Cl.list([Cl.int(20), Cl.int(20)]),
          army: Cl.list(Array(3).fill(Cl.int(2)))
        })
      })
    })

    it("raids calculate the loot - for losers", () => {
      simnet.callPublicFn('rts','create-campaign', [Cl.list(returnCampaignResources())], address1)
      const firstPlayerTrainingAmount = 1
      const secondPlayerTrainingAmount = firstPlayerTrainingAmount + 3
      const firstPlayerResources = returnResources()
      const secondPlayerResources = returnResources()

      for (let index = 0; index < 3; index++) { // get some army
        simnet.callPublicFn(
          'rts',
          'train-soldiers',
          [Cl.uint(index), Cl.int(firstPlayerTrainingAmount)],
          address2
        );
        const [i, amount] = returnUnitResourceCostIndex(index)
        firstPlayerResources[i] -= amount * firstPlayerTrainingAmount
        // defender's defense
        simnet.callPublicFn(
          'rts',
          'train-soldiers',
          [Cl.uint(index), Cl.int(secondPlayerTrainingAmount)],
          address3
        );
        secondPlayerResources[i] -= amount * (secondPlayerTrainingAmount)

        simnet.mineEmptyBlocks(5)

        simnet.callPublicFn(
          'rts',
          'train-soldiers',
          [Cl.uint(index), Cl.int(0)],
          address2
        )
        // defender's defense
        simnet.callPublicFn(
          'rts',
          'train-soldiers',
          [Cl.uint(index), Cl.int(0)],
          address3
        )
      }

      const tx: any = simnet.callPublicFn(
        'rts',
        'send-raid',
        [Cl.principal(address3), Cl.list(Array(3).fill(Cl.int(firstPlayerTrainingAmount)))],
        address2
      )
      const txEventValue: bigint = tx.events[0].data.value.value

      simnet.mineEmptyBlocks(7)

      simnet.callPublicFn(
        'rts',
        'return-raid',
        [Cl.principal(address3)],
        address2
      )

      const raid = simnet.getMapEntry('rts', 'raids', Cl.tuple({
        invader: Cl.principal(address2),
        defender: Cl.principal(address3)
      }))
      expect(raid).toBeSome(Cl.tuple(
        {
          army: Cl.list(Array(3).fill(Cl.int(0))),
          success: Cl.some(Cl.bool(false)), // address2 lost
          timestamp: Cl.uint(txEventValue)
        })
      )

      const firstPlayerState = (simnet.callReadOnlyFn("rts","get-player", [Cl.principal(address2)], address2)).result
      const secondPlayerState = (simnet.callReadOnlyFn("rts","get-player", [Cl.principal(address3)], address3)).result
      expect(firstPlayerState).toBeTuple({
        "last-raid": Cl.uint(0),
        resources: Cl.list(Array(5).fill(null).map((_, index) => {
          return Cl.int(firstPlayerResources[index]);
        })), // aqui
        pawns: Cl.int(100-(firstPlayerTrainingAmount*3)),
        town: Cl.tuple({
          defenses: Cl.list([Cl.int(20), Cl.int(20)]),
          army: Cl.list(Array(3).fill(Cl.int(firstPlayerTrainingAmount)))
        })
      })
      expect(secondPlayerState).toBeTuple({
        "last-raid": Cl.uint(txEventValue),
        resources: Cl.list(Array(5).fill(null).map((_, index) => {
          return Cl.int(secondPlayerResources[index]);
        })),
        pawns: Cl.int(100-(secondPlayerTrainingAmount*3)),
        town: Cl.tuple({
          defenses: Cl.list([Cl.int(20), Cl.int(20)]),
          army: Cl.list(Array(3).fill(Cl.int(secondPlayerTrainingAmount)))
        })
      })
    })

    // describe("repair activities", () => {
    //   it("defense building, respecting pawn limits", () => {
    //     expect(false).to.be.true
    //   })

    //   it("town structure rebuilding, respecting pawn limits", () => {
    //     expect(false).to.be.true
    //   })
    // })

  })
});
