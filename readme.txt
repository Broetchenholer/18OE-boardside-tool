This is my tool to save space for the game 18OE. It removes the need for company boards, cash, train cards, shares, port authority tokes and OE run tokens. You still need the Stock market board and it is not 
being tracked which private ability is being used for which company if this is relevant. So use a pen and paper for that.

To install move all files to a random folder. Then install node.js.

First, make sure the game is in your language. I have provided the files in english, but there is also a german version, 
if you want german, change the names of the german files to without _deutsch and remove the original files.

The german version is better tested, the english one was hastily translated last minute for the international audience, it should not be broken, but there might be a random german label popping up somewhere.

If you are running windows like me, start the command prompt, go into the folder you just created and type node server.js.

The server is now running, awaiting commands.

To start a game, type your local ip into a browser followed by the port :3000 and the link /admin like:

192.168.1.1:3000/admin

This is file admin.html. In this page you can create a new game or change the current game. There is no possibility to run games in parallel, you use the admin page to set the current game and from then on all other pages will link to that game.
Type in a name for the game, type in the players, preferably in player order and in the smalles possible player spot, i don't think i programmed empty player slots in between :D

then create and set the game as the current game in the form above.

From then on, you need the input page, reachable either by clicking the link at the bottom of the admin page or by simply typing yourip:3000/input. This is 18OE.html

The input page will update the game state. It is not really safe to be used by several people, it does not update the game state automatically, but two instancen can run on different devices and chances 
that they mess with each other are very slim. it updates when a change is pushed to the server, so just be careful that updates are coordinated.

The players use the tool by calling yourip:3000/ or yourip:3000 on their handheld devices, they can then select their name and from then on they can simply remain on that page. This is player.html. The page autorefreshes with changes
and does not care if the player reloads it. It will remember how the page looked prior to a refresh.

The database of all created files is data.json, all games are in there. If you want to simply edit something that went wrong, you can, just remember to restart the server afterwards or you wont see changes.

Then there is the starter.html, it's just for the page where players choose their view.

The whole project is done by someone with virtually no programming and developing background, so it's a hot mess. Earliest parts are significantly different then later ones, all is done with the help of AI and therefore, 
a lot of the stuff is weird and not really professional. But it works. If you find bugs, you can report them in the board game geeek forum or on github. 



Functionality: 

The player interface is pretty straightforward, people look at it and hopefully immentiately udnerstand the information.

The input interface needs explaining though:

All input forms are below each other, i will explain all briefly:

Balance Transfer: THis is used to simply send money from one entity to another. Entities are players, companies and the bank. Fields are not automatically refreshed after a submit, 
so if you tick the checkbox for reverse money flow, you can basically undo something. This form is the default way of doing a money transfer it the more specialized forms cannot do it automatically.

Distribute gains for company: Choose a company, minor or major from the dropdown, put in the amount that got calculated by the players as total income and click distribute gains. If it is a minor,
the chckbox for distribute half is automatically set and locked, for a major it can be flagged if needed and a major automatically disables und unticks the checkbox.

If you need to retain the money in the company, use Balance Transfer.

There is a checkbox for OE run, which only affects the GUI. Once you set this for a company, the checkbox will remain checked until you undo it. A major with that flag will display an '(OE)' next to it's 
name in the player ui. You can use a 0 payout to reset the flag for a company or you wait until the company pays out again and untick the checkbox then.

Buy Shares/Certificates:

Put in a company, then all shares will populate the send dropdown, then choose the new owner - this part is being forgotten a lot :) - put in a value, the tool does not track stock value at al. Valid targets
for the owner are players, the bank and companies. This is because merging minors into majors is being done, among other steps, by selling the minors certificate to the major for 0.

Train Side Purchase: Current Owner is usually set up with the Bank. It will show all trains that are owned by the selected entity. The side can be chosen if the train is owned by the bank and set if it is 
owned by a company alreay. Then put in new owner, the standard price will be prefilled but can be overwritten. If the new owner is a national, the value will be set to 0 if the current owner is a bank, and set
to half the standard price if the current owner is a company. But the price can be set pby the player nonetheless. There is a checkbox to show or hide rusted trains, this checkbox does not refresh with changes,
so manually activate it if you want to move a rusted train and then uncheck it again.

Place Token on Board: Select the company, then select which token, then the price. The price based on the region will be prefilled and can be overwritten. If you want to undo or take a token back, select the token
and click the button again. Default price for this will be 0. This functionality is only to update the player ui with which tokens are available, so you don't have to mess with the tokens of disabled companies
like merged minors.

Sell Port AUthority Marker: Choose a marker, pick a new owner, company or bank, and press the button. 125 pounds will be sent with the sale. So you can undo if you send the marker back to the bank.

Pay for Privates: Does exactly that, but also includes Minor K or the major that Minor K merged into. Cannot be undone except for manually moving money back to the bank.

Regional/Major/National Mode: Chose a company and press the button. Regional becomes Major, Major becomes National, National becomes Regional again. This will affect logic of other steps as well as the display
of for instance stocks in the player ui.

Minor Rights Assignment; This is used at the start of the game to give track rights to the minors once. Make sure to move money to the minors first by buying the certificate by a player or if you play with the fast start
and have a starting pack, by using Money Transfer from the bank. The correct amount of money for each region is used.

Set Companies as inactive/active: You can use this to remove the 6 unused regionals from the UI, as well as merged minors and privates. This is mainly to remove clutter from the input UI as inactive entities are removed from
the masks. It is also used to remove the removed private certificates from player hands.

Rust/Unrust trains: With this, you can rust level 2, level 3 and level 4 trains. If you press the button, all trains from the level will be sold for 0 to the bank, except for companies that are Nationals at the time of
pressing the button. So, first nationalize your companies, then move their money back to the bank, don't bother with tokens, then rust the trains. For Swift Metropolitan, go to the Buy train form, tick show rusted trains,
and buy a train for 0.



If you want to merge a minor, all steps are manual. First move the money to the major with Transfer Money, then transfer the trains to the major for 0. Ignore the minors tokens, put the tokens that the major is allowed
to put on board for free with price 0 and then sell the certificate of the minor the the major, not the owner of the major. Last, deactivate the Minor.

If there is uncertainty if everything is correct, first step to look it the player ui. Every entity with a balance has a log of balance moving steps if you press the + button next to their balance. There you can pretty
easily see what happened. All steps can be undone either directly using the same form or a combination of the other forms. Some may just be really annoying, like rusting trains, as the game does not remember from whom
the trains were taken, so you then have to manually move the trains back to their old owners. If everything fails, go into the json and manually change stuff, but for that you will probably have to understand the logic
in some cases.






